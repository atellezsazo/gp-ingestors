'use strict';

const libingester = require('libingester');
const url = require('url');

const RSS_URI = 'http://www.bollywoodlife.com/feed/';

// clean attr (tag)
const CLEAN_TAGS= [
    'a',
    'h2',
    'i',
    'img',
    'p',
    'span',
    'ul',
];

// remove attr (tag)
 const REMOVE_ATTR = [
    'alt',
    'class',
    'data-event-order',
    'data-event-sub-cat',
    'data-move',
    'height',
    'rel',
    'sizes',
    'title',
    'width',
];

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'iframe',
    'noscript',
    'script',
    'style',
    '.instagram-media',
    '.islide-controller',
    '.quote-decoration',
    '.twitter-tweet',
];

/**
 * ingest_article
 */
function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.link).then($ => {
        const asset = new libingester.NewsArticle();
        const body = $('div[itemprop="articleBody"]').first().attr('id', 'mybody');
        const post_category = $('.topics-tags a span').first().text();
        const main_image_uri = $('meta[property="og:image"]').attr('content');
        const post_author = $('meta[name="author"]').attr('content');
        const post_synopsis = $('meta[property="og:description"]').attr('content');
        const lede = $('h2[itemprop="description"]').first();
        let media_promises = [];

        // article settings
        asset.set_canonical_uri(item.link);
        asset.set_section(post_category);
        asset.set_title(item.title);
        asset.set_date_published(item.date);
        asset.set_synopsis(post_synopsis);
        asset.set_last_modified_date(item.date);
        asset.set_lede(lede);
        asset.set_source('Bollywoodlife');
        asset.set_license('Proprietary');
        asset.set_read_more_link(`Original Article at <a href="${item.link}">Bollywoodlife</a>`);
        asset.set_authors(post_author);

        // finding first wrapp; "elem": Object Cheerio; "id_main_tag": String
        const find_first_wrapp = (elem, id_main_tag) => {
            let current = elem;
            let parent = $(current).parent()[0];
            while (parent) {
                if ($(parent).attr('id') == id_main_tag) {
                    return current;
                } else {
                    current = parent;
                    parent = $(current).parent()[0];
                }
            }
        }

        // fix the image, add figure and figcaption
        const fix_img_with_figure = (replace, src, alt = '', search_caption, find_caption) => {
            if (src && replace) {
                let figure = $(`<figure><img src="${src}" alt="${alt}"></img></figure>`);
                let caption = [];
                // finding figcaption by search_caption or callback function (find_caption)
                if (find_caption) {
                    caption = find_caption();
                } else if (search_caption) {
                    caption = $(replace).find(search_caption).first();
                }
                // if found.. add to figure
                if (caption[0]) {
                    figure.append(`<figcaption><p>${caption.html()}</p></figcaption>`);
                }
                // replace and return
                $(replace).replaceWith(figure);
                return figure;
            }
        }

        // fixed embed videos (twitter)
        const download_twitter_video = (body, search, title) => {
            let twitter_video_promises = [];
            body.find(search).map((i,elem) => {
                for (const a of $(elem).find('a').get()) {
                    const href = $(a).attr('href') || '';
                    let domain = href ? url.parse(href).hostname : '';
                    if (domain == 'twitter.com' && href.includes('/status/')) {
                        twitter_video_promises.push(
                            libingester.util.fetch_html(href).then($tw => {
                                const uri_thumb = $tw('meta[property="og:image"]').attr('content');
                                const download_uri = $tw('meta[property="og:video:url"]').attr('content');
                                if (uri_thumb && download_uri) {
                                    const video_thumb = libingester.util.download_image(uri_thumb);
                                    const video = libingester.util.get_embedded_video_asset($(elem), download_uri);
                                    video_thumb.set_title(title);
                                    video.set_title(title);
                                    video.set_thumbnail(video_thumb);
                                    hatch.save_asset(video_thumb);
                                    hatch.save_asset(video);
                                }
                            })
                        );
                        break;
                    }
                }
            });
            return twitter_video_promises;
        }

        // fixed embed videos (instagram)
        const download_instagram_video = (body, title) => {
            let instagram_video_promises = [];
            body.find('.instagram-media').map((i,elem) => {
                for (const a of $(elem).find('a').get()) {
                    const href = $(a).attr('href') || '';
                    let domain = href ? url.parse(href).hostname : '';
                    if (domain == 'www.instagram.com') {
                        instagram_video_promises.push(
                            libingester.util.fetch_html(href).then($in => {
                                const uri_thumb = $in('meta[property="og:image"]').attr('content');
                                const download_uri = $in('meta[property="og:video"]').attr('content');
                                if (uri_thumb && download_uri) {
                                    const video_thumb = libingester.util.download_image(uri_thumb);
                                    const video = libingester.util.get_embedded_video_asset($(elem), download_uri);
                                    video_thumb.set_title(title);
                                    video.set_title(title);
                                    video.set_thumbnail(video_thumb);
                                    hatch.save_asset(video_thumb);
                                    hatch.save_asset(video);
                                }
                            })
                        );
                        break;
                    }
                }
            });
            return instagram_video_promises;
        }

        // resolve the thumbnail from youtube
        const get_url_thumb_youtube = (embed_src) => {
            const thumb = '/0.jpg';
            const base_uri_img = 'http://img.youtube.com/vi/';
            const uri = url.parse(embed_src);
            const is_youtube = ((uri.hostname === 'www.youtube.com') || (uri.hostname === 'www.youtube-nocookie.com'));
            if (is_youtube && uri.pathname.includes('/embed/')) {
                const path = uri.pathname.replace('/embed/','') + thumb;
                return url.resolve(base_uri_img, path);
            }
        }

        // main image
        const main_image = libingester.util.download_image(main_image_uri);
        main_image.set_title(item.title);
        asset.set_thumbnail(main_image);
        hatch.save_asset(main_image);
        asset.set_main_image(main_image, '');

        // set featured gallery
        const f_gallery = $('.featuredgallery').first();
        const first_p = body.find('p').first(); // reference point
        f_gallery.find('figure').map((i,elem) => $(elem).insertBefore(first_p));

        // remove hreview
        body.find('.hreview').remove();

        // fix images into p
        body.find('p img').map((i,elem) => {
            const parent = $(elem).parent();
            const wrapp = find_first_wrapp(elem, body.attr('id'));
            if (parent[0].name == 'a') {
                parent.insertBefore(wrapp);
            } else {
                $(elem).insertBefore(wrapp);
            }
        });

        // download images
        body.find('img').map((i,elem) => {
            const wrapp = find_first_wrapp(elem, body.attr('id'));
            const alt = $(elem).attr('alt');
            const src = $(elem).attr('src').replace('-321x229','');
            const figure = fix_img_with_figure(wrapp, src, alt, '.caption');
            const image = libingester.util.download_img($(figure.children()[0]));
            image.set_title(item.title);
            hatch.save_asset(image);
        });

        // download video youtube (iframe)
        body.find('iframe').map(function() {
            const src = this.attribs.src;
            const wrapp = find_first_wrapp(this, body.attr('id'));
            const uri_thumb = get_url_thumb_youtube(src);
            if (uri_thumb) {
                const video = libingester.util.get_embedded_video_asset($(wrapp), src);
                const thumb = libingester.util.download_image(uri_thumb);
                thumb.set_title(item.title);
                video.set_title(item.title);
                video.set_thumbnail(thumb);
                hatch.save_asset(thumb);
                hatch.save_asset(video);
            }
        });

        // download video (tag video)
        body.find('.wp-video').map((i,elem) => {
            const src = $('source').attr('src');
            const video = libingester.util.get_embedded_video_asset($(elem), src);
            video.set_title(item.title);
            video.set_thumbnail(main_image);
            hatch.save_asset(video);
        });

        asset.set_custom_scss(`
            $primary-light-color: #FF0000;
            $primary-medium-color: #000000;
            $primary-dark-color: #BF0072;
            $accent-light-color: #E6268C;
            $accent-dark-color: #D60A76;
            $background-light-color: #F5F5F5;
            $background-dark-color: #D8D8D8;
            /*Extra Color: #FDEF00*/
            $title-font: 'FreeSans';
            $body-font: 'Merriweather';
            $display-font: 'FreeSans';
            $context-font: 'FreeSans';
            $support-font: 'FreeSans';
            @import '_default';
        `);

        // end process
        const end_process = () => {
            // remove and clean elements
            const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
            body.contents().filter((index, node) => node.type === 'comment').remove();
            body.find(REMOVE_ELEMENTS.join(',')).remove();
            body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));
            body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();

            // conver p>strong to h2
            body.find('p>strong').map((i,elem) => {
                const parent = $(elem).parent();
                const em = $(elem).find('em').first();
                if (parent.text().trim() == $(elem).text().trim() && !em[0]) {
                    parent.replaceWith(`<h2>${$(elem).text()}</h2>`);
                }
            });

            asset.set_body(body);
            asset.render();
            hatch.save_asset(asset);
        }

        // dowload embed videos
        media_promises = media_promises.concat(download_twitter_video(body, '.twitter-video, .twitter-tweet', item.title));
        media_promises = media_promises.concat(download_instagram_video(body, item.title));

        if (media_promises.length > 0) {
            return Promise.all(media_promises).then(end_process);
        } else {
            end_process();
        }
    })
    .catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') return ingest_article(hatch, item);
    });
}

/**
 * @return {Promise}
 */
function main() {
    const hatch = new libingester.Hatch('bollywoodlife', 'en');
    const feed = libingester.util.create_wordpress_paginator(RSS_URI);

    libingester.util.fetch_rss_entries(feed).then(entries => {
        return Promise.all(entries.map(entry => ingest_article(hatch, entry)));
    })
    .then(() => hatch.finish())
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
