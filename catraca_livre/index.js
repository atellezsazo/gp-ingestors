'use strict';

const libingester = require('libingester');
const moment = require('moment');
const url = require('url');

const BASE_URI = 'http://www.siamsport.co.th/';
const RSS_URI = 'https://catracalivre.com.br/feed';

// clean images
const REMOVE_ATTR = [
    'class',
    'style'
];

// Remove elements (meta.body)
const REMOVE_ELEMENTS = [
    //'iframe',
    'hr',
    'label',
    'blockquote',
    '.credito-foto',
    '.fb-video',
    '.fb-save',
    '.g-ytsubscribe',
    '.assinatura-especial',
    '.box-caixa-de-servico',
    '.emoji',
    '.OUTBRAIN',
    'i',
    '.contagem-slide-post textright',
    '.catraca-post-slideshow',
    '.arrows-holder',
    '.theater-switcher',
    '.counter',
    '.catraca-theater',
    '.inner-gallery-banner',
    '.aba__content',
    '.veja-mais-block',
    '.inner-gallery-banner',
    '.close-banner',
    '.credit',
    '.textleft',
    '.EmbeddedTweet-tweet',
    '.EmbeddedTweet',
    '.assinatura-especial',
    '.box-caixa-de-servico'
];

// copyright warning
const REMOVE_COPYRIGHT = [
    'Getty Images',
    'mirror.com',
    'Siamsport',
    '"บอ.บู๋"'
];

const CUSTOM_SCSS = `
$primary-light-color: #4F82B8;
$primary-medium-color: #084F9B;
$primary-dark-color: #093365;
$accent-light-color: #DD377F;
$accent-dark-color: #B41158;
$background-light-color: #FCFCFC;
$background-dark-color: #EDEDED;
$title-font: 'Noto Serif';
$body-font: 'Noto Sans';
$display-font: 'Noto Sans';
$context-font: 'Noto Sans';
$support-font: 'Noto Sans';

@import '_default';
`;

function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.link).then(($) => {
        const asset = new libingester.NewsArticle();

        const author = $('.autor-e-data__txt-menor').text();
        const body = $('.post-content').first().attr('id', 'mybody');
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const info_date = $('meta[property="article:modified_time"]').attr('content');
        const modified_date = info_date ? new Date(Date.parse(info_date)) : new Date();
        const page = 'Catraca livre';
        const read_more = `Original post em <a href="${canonical_uri}">${page}</a>`;
        const synopsis = $('meta[name="description"]').attr('content');
        const section = $('meta[property="article:section"]').attr('content') || 'Article';
        const title = $('meta[property="og:title"]').attr('content');
        const uri_main_image = $('meta[property="og:image"]').attr('content');
        let thumbnail, instagram_promise = [];

        body.find('noscript, script, style, input').remove();

        // finding first wrapp; "elem": Object Cheerio; "id_main_tag": String
        const find_first_wrapp = (elem, id_main_tag) => {
          let current = elem;
          let parent = $(current).parent()[0];
          while (parent) {
              const attr = parent.attribs || {};
              if (attr.id == id_main_tag) {
                  return current;
              } else {
                  current = parent;
                  parent = $(current).parent()[0];
              }
          }
        }

        // fix the image, add figure and figcaption (caption: String, search_caption: String, find_caption: function)
        const fix_img_with_figure = (replace, src, alt = '', to_do = 'replace', caption, search_caption, find_caption) => {
          if (src && replace) {
              let figure = $(`<figure><img src="${src}" alt='${alt}'/></figure>`);
              let figcaption = $(`<figcaption></figcaption>`);
              // finding figcaption by search_caption or callback function (find_caption)
              if (typeof caption == 'string') {
                  figcaption.append(`<p>${caption}</p>`);
              } else if (find_caption) {
                  const cap = find_caption();
                  figcaption.append(`<p>${cap.html()}</p>`);
              } else if (search_caption) {
                  const cap = $(replace).find(search_caption).first();
                  figcaption.append(`<p>${cap.html()}</p>`);
              }
              // if found.. add to figure
              if (figcaption.text().trim() != '') {
                  figure.append(figcaption);
              }
              // replace or insert and return
              switch (to_do) {
                  case 'replace': { $(replace).replaceWith(figure); break; }
                  case 'after': { figure.insertAfter(replace); break; }
                  case 'before': { figure.insertBefore(replace); break; }
              }

              if (to_do != 'replace') figure = body.find(`figure img[src="${src}"]`).parent();
              return figure;
          } else {
              $(replace).remove();
          }
        }

        // replace buttons by span
        body.find('button>span').map((i,elem) => {
            $(elem).parent().replaceWith(elem);
        });

        // fix gallery images
        body.find('.catraca-post-slideshow').map((i,elem) => {
            $(elem).find('.slide').map((i,slide) => {
                const img = $(slide).find('img').first();
                const src = img.attr('data-lazy-src');
                fix_img_with_figure(elem, src, '', 'before', undefined, undefined, () => {
                    const credit = $(slide).find('.credit').first();
                    const caption = $('<p></p>');
                    if (credit[0]) caption.append(`${credit.html()}`);
                    return caption;
                });
            });
        })


        // fix Instragram iamges
        body.find('blockquote.instagram-media').map((i,elem) => {
            const url_img = $(elem).find('a').first().attr('href');
            instagram_promise.push(
                libingester.util.fetch_html(url_img).then($img_insta => {
                    const insta_uri =  $img_insta('meta[property="og:image"]').attr('content');
                    const image_credit = $img_insta('meta[property="og:description"]').attr('content');
                    const figure = fix_img_with_figure(elem, insta_uri, '', 'replace', image_credit);
                })
            )
        });
        // console.log(body.html());

        //fix wp-embed
        body.find('iframe.wp-embedded-content').map((i,elem) => {
            const url_img = $(elem).attr('src');
            instagram_promise.push(
                libingester.util.fetch_html(url_img).then($img_insta => {
                    const src = $img_insta('img').first().attr('src');
                    const image_credit = $img_insta('.wp-embed-excerpt').first().text();
                    fix_img_with_figure($(elem).parent(), src, '', 'replace', image_credit);
                })
            );
        });

        // // resolve the thumbnail from youtube
        // const get_url_thumb_youtube = (embed_src) => {
        //     const thumb = '/0.jpg';
        //     const base_uri_img = 'http://img.youtube.com/vi/';
        //     const uri = url.parse(embed_src);
        //     if (uri.hostname === 'www.youtube.com' && uri.pathname.includes('/embed/')) {
        //         const path = uri.pathname.replace('/embed/','') + thumb;
        //         return url.resolve(base_uri_img, path);
        //     }
        // }

        //Ingest Video
        body.find('p>iframe').map((i,elem) => {
            const src = elem.attribs.src;
            if (src.includes('www.youtube.com')) {
                const uri_thumb = src;
                const video = libingester.util.get_embedded_video_asset($(elem).parent(), src);
                const video_thumb = libingester.util.download_image(uri_thumb);
                video_thumb.set_title(title);
                video.set_title(title);
                video.set_thumbnail(video_thumb);
                hatch.save_asset(video_thumb);
                hatch.save_asset(video);
            }
        });

        const end_function = () => {
            //fixed all 'divs'
            const fix_divs = (div = body.children().find('div>div').first()) => {
                if (div[0]) {
                    const parent = $(div).parent();
                    $(parent).children().insertBefore(parent);
                    fix_divs(body.children().find('div>div').first());
                }
            }
            fix_divs();

            // fix wp-caption (one image)
            body.find('.wp-caption').map((i,elem) => {
                const img = $(elem).find('img').first();
                const src = img.attr('data-lazy-src') || img.attr('src');
                fix_img_with_figure(elem, src, '', 'replace', undefined, undefined, () => {
                    const credit = $(elem).find('.credito-foto').first();
                    const description = $(elem).find('.wp-caption-text').first();
                    const caption = $('<p></p>');
                    if (credit[0]) caption.append(`${credit.html()}`);
                    if (description[0]) caption.append(`<br />${description.html()}`);
                    return caption;
                });
            });




            body.children().find('div>p').map((i,p) => $(p).insertBefore($(p).parent()));

            // body.find('.contagem-slide-post').remove();
            body.contents().filter((i,elem) => elem.name == 'div').remove();
            body.find(REMOVE_ELEMENTS.join(',')).remove();





            body.find('img').map((i, elem) => {
                const caption = $(elem).parent().find('.wp-caption-text').first().text();
                const src = $(elem).attr('data-lazy-src') || $(elem).attr('src');
                const wrapp = find_first_wrapp(elem,body.attr('id'));
                let down_img;
                let figure;
                if ($(elem).parent()[0].name != 'figure') {
                    figure = fix_img_with_figure(wrapp, src, '', 'before', caption);
                } else {
                    figure=$(elem).parent();
                }

                down_img = libingester.util.download_img($(figure.children()[0]));
                down_img.set_title(title);
                if (!thumbnail) asset.set_thumbnail(thumbnail=down_img);
                hatch.save_asset(down_img);

            });

            $('.wp-caption, .slide').remove();


            body.find('span>strong').map((i,elem) => {
                const text=$(elem).text();
                $(elem).parent().replaceWith(`<h2>${text}</h2>`);
            });

            body.find('label>figure, .wp-caption>figure, .box-aba__content>p').map((i,elem) => {
                $(elem).parent().replaceWith(elem);
            });

            body.find('div, p').filter((i,elem) => $(elem).text().trim() == '').remove();

            // Pull out the main image
            let main_image, image_credit;
            if (uri_main_image && !thumbnail) {
                main_image = libingester.util.download_image(uri_main_image, item.link);
                main_image.set_title(title);
                image_credit = $('.wp-caption-text').text();
                hatch.save_asset(main_image);
                asset.set_thumbnail(main_image);
                asset.set_main_image(main_image, image_credit);
            }

            // // set first paragraph
            // const first_p = body.find('p').first();
            // const lede = first_p.clone();
            // lede.find('img').remove();
            // body.find(first_p).remove();

            for (const p of body.contents().get()) {
                if (p.name=='p') {
                    asset.set_lede($(p).clone());
                    $(p).remove();
                    break;
                }
            }
            //Remove ul with Leia mais:
            const last_ul = body.find('ul').last();
            if (last_ul.text().trim() == 'Leia mais:') {
                last_ul.remove();
            }

            // console.log('processing', item.link);
            asset.set_authors([author]);
            asset.set_canonical_uri(canonical_uri);
            //asset.set_custom_scss(CUSTOM_CSS);
            asset.set_date_published(Date.now(modified_date));
            asset.set_last_modified_date(modified_date);
            asset.set_read_more_link(read_more);
            asset.set_section(section);
            asset.set_source(page);
            asset.set_synopsis(synopsis);
            asset.set_title(title);
            //asset.set_main_image(main_image,image_credit);
            asset.set_body(body);

            asset.render();
            hatch.save_asset(asset);
        }


        if (instagram_promise.length > 0) {
            return Promise.all(instagram_promise).then(() => end_function());
        } else {
            end_function();
        }
    }).catch((err) => {
        console.log('Ingest article error: ', err);
        if (err.code==-1) { return ingest_article(hatch, item.link); }
    });
}



function main() {

    // wordpress pagination
   const feed = libingester.util.create_wordpress_paginator(RSS_URI);
   const hatch = new libingester.Hatch('catraca_livre', 'pt');


   // //
   // const item = {
   //      link:'https://catracalivre.com.br/geral/moda-e-beleza/indicacao/jovem-faz-maquiagem-inspirada-em-programas-da-sua-infancia/',
   //      pubdate:'2017-06-28T08:47:48.000Z',
   //      categories : [ 'News & Current Events',
   //     'airlines',
   //     'all nippon airways',
   //     'awards',
   //     'Japan',
   //     'skytrax' ]
   //  }
   //  ingest_article(hatch,item)
   //  .then(()=> hatch.finish()
   //  );

   libingester.util.fetch_rss_entries(feed, 20, 100).then(rss => {
            return Promise.all(rss.map(item => ingest_article(hatch, item)))
                    .then(() => hatch.finish());
       }).catch((err) => {
           console.log('Error ',err);
        });
}

main();
