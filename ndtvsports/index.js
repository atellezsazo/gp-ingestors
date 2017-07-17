'use strict';

const libingester = require('libingester');
const FeedParser = require('feedparser-promised');

const RSS_URI = 'https://sports.ndtv.com/rss/all';

// clean attr (tag)
const CLEAN_TAGS= [
     'p',
     'span',
     'div',
     'img',
];

// remove attr (tag)
 const REMOVE_ATTR = [
     'class',
     'alt',
     'id',
  ];

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'blockquote',
    'iframe',
    'noscript',
    'span',
    'script',
    'style',
    'video',
];

function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.link).then($ => {
        const asset = new libingester.NewsArticle();
        const body = $('div[itemprop="articleBody"]');
        const category = $('.category a span').first().text();
        const main_image_uri = $('meta[property="og:image"]').attr('content');
        const author = $('div[itemprop="author"]').first();
        const synopsis = $('meta[property="og:description"]').attr('content');
        const date = new Date($('meta[itemprop="datePublished"]').attr('content'));
        const copyright = $('.copyrights span').text() || 'Proprietary';
        let thumbnail;

        // fixed authors
        author.find('.nd-right').remove();
        let authors = author.find('span[itemprop="name"]').first().text();
        if (!authors) authors = author.text().trim().replace('Written by ','');
        authors = authors.split(', ');

        // download main image
        if (main_image_uri) {
            const main_image  = libingester.util.download_image(main_image_uri);
            let main_caption = $('.photo-crtsy span').first().text();
            if (main_caption) main_caption = $(`<figcaption><p>${main_caption}</p></figcaption>`);
            main_image.set_title(item.title);
            hatch.save_asset(main_image);
            asset.set_thumbnail(thumbnail = main_image);
            asset.set_main_image(main_image, main_caption);
        }

        // set lede
        const lede_text = $('div[itemprop="description"]').first().text() || synopsis;
        asset.set_lede($(`<p>${lede_text}<p>`));

        // download images
        body.find('img').get().map((img) => {
            const image = libingester.util.download_img($(img));
            image.set_title(item.title);
            hatch.save_asset(image);
            if (!thumbnail) asset.set_thumbnail(thumbnail = image)
        });

        // Put images in <figure>
        body.find('img').map(function() {
            const parent = $(this).parent();
            const figure = $('<figure></figure>');
            let figcaption = '';

            if($('.ins_instory_dv_caption span').first().text()) {
                figcaption = $("<figcaption><p>"+$('.ins_instory_dv_caption span').first().text()+"</p></figcaption>");
                figure.append($(this).clone(),figcaption);
            }

            parent.replaceWith(figure);
            $(figure).append($(this));
            $(this).remove();
        });

        // download video
        body.find('iframe').map(function() {
            const src = this.attribs.src;
            if (src) {
                const video = libingester.util.get_embedded_video_asset($(this), src);
                video.set_title(item.title);
                video.set_thumbnail(main_image);
                hatch.save_asset(video);
            }
        });

        // convert 'p strong' to 'h2'
        body.find('p>strong').map((i,elem) => {
            const text = $(elem).text();
            let parent = $(elem).parent()[0];
            while (parent) {
                if (parent.name == 'p') {
                    const p_text = $(parent).text();
                    if (text == p_text) {
                        $(parent).replaceWith($(`<h2>${text}</h2>`));
                    }
                    break;
                } else {
                    parent = $(parent).parent()[0];
                }
            }
        });

        // remove and clean elements
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.contents().filter((index, node) => node.type === 'comment').remove();
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));
        body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();

        asset.set_custom_scss(`
            $primary-light-color: #1286C6;
            $primary-medium-color: #0B0B0B;
            $primary-dark-color: #07264A;
            $accent-light-color: #00AFF0;
            $accent-dark-color: #00A1DD;
            $background-light-color: #E6E6E6;
            $background-dark-color: #CCCCCB;
            $title-font: 'Roboto';
            $body-font: 'Merriweather';
            $display-font: 'Roboto';
            $context-font: 'Montserrat';
            $support-font: 'Roboto';
            @import '_default';
        `);

        // article settings
        console.log('processing', item.title);
        asset.set_canonical_uri(item.link);
        asset.set_section(category);
        asset.set_title(item.title);
        asset.set_date_published(date);
        asset.set_synopsis(synopsis);
        asset.set_last_modified_date(date);
        asset.set_source('Sports NDTV');
        asset.set_license(copyright);
        asset.set_read_more_link(`Original Article at <a href="${item.link}">www.sports.ndtv.com</a>`);
        asset.set_authors(authors);
        asset.set_body(body);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') return ingest_article(hatch, item);
    });
}


function main() {
    const hatch = new libingester.Hatch('ndtv-sports', 'en');
    const max_articles = parseInt(process.argv[2]) || 20;

    FeedParser.parse(RSS_URI)
        .then(items => {
            return Promise.all(items.slice(0,max_articles).map(item => ingest_article(hatch, item)));
        })
        .then(() => hatch.finish())
        .catch(err => {
           console.log(err);
           process.exitCode = 1;
        });
}

main();
