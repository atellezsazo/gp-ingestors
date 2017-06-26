'use strict';

const cheerio = require('cheerio');
const libingester = require('libingester');

const BASE_URI = 'http://bk.asia-city.com/';
const RSS_URI = 'http://www.indiechine.com/?feed=rss2';

const CUSTOM_SCSS = `
$primary-light-color: #A4B3C3;
$primary-medium-color: #666666;
$primary-dark-color: #102F4E;
$accent-light-color: #569D13;
$accent-dark-color: #2E5609;
$background-light-color: #F9F9F9;
$background-dark-color: #E5E9EA;
  
$title-font: 'Lora';
$body-font: 'Lora';
$display-font: 'Lato';
$logo-font: 'Lora';
$context-font: 'Lora';
$support-font: 'Lato';
 
@import '_default';
`;

/**
 * utilities
 *
 * A utility library
 *
 * @param {Objet} $ Instance to manipulate the DOM of the post given
 * @param {Objet} item The object with the metadata of post
 */
function utilities($, item) {
    /** array of tags to be removed */
    const _remove_elements = [
        '.jp-relatedposts',
        '.ssba',
        '[data-pin-do="buttonBookmark"]',
        'span[data-pin-log="button_pinit_bookmarklet"]',
        'br',
        'script',
    ];

    /** array of attributes to be removed */
    const _remove_attr = [
        'alt',
        'class',
        'data-recalc-dims',
        'dir',
        'height',
        'id',
        'rel',
        'sizes',
        'style',
        'width',
    ];

    /** array of tags to be cleaned */
    const _clean_tags = [
        'a',
        'div',
        'em',
        'figcaption',
        'figure',
        'h1, h2, h3, h4, h5, h6',
        'img',
        'p',
        'ol',
        'span',
        'strong',
        'u',
        'ul',
    ];

    /** Returns the extracted text from an array of HTML elements */
    const _extract_text = (tags) => {
        return tags.map((id, tag) => {
            return $(tag).text();
        }).get().join(', ');
    };

    /** removes the designated HTML tags from the content */
    const _sanitize_content = (content, tags) => {
        let rmtags = tags || _remove_elements;
        content.contents().filter((index, node) => node.type === 'comment').remove();
        content.find(rmtags.join(',')).remove();
        return content;
    };

    /** removes the attributes of the designated HTML tags from the content */
    const _sanitize_attr = (content) => {
        const clean_attr = (tag, a = _remove_attr) => a.forEach((attr) => $(tag).removeAttr(attr));
        content.find(_clean_tags.join(',')).get().map((tag) => clean_attr(tag));
        return content;
    }

    /** remove elements and comments */
    const _cleaning_body = (content) => {
        content = _sanitize_content(content);
        content = _sanitize_attr(content);
        return content;
    };

    return {
        /** object with the processed metadata of a post  */
        post_metadata: () => {
            return {
                body: _cleaning_body($('article .entry-content').first()),
                category: _extract_text($('.cat-links a')),
                date: new Date(Date.parse($('.published').attr('datetime'))),
                tags: _extract_text($('.tags-links a[rel="tag"]')),
            }
        },
    }
}

/**
 * ingest_article
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {Object} item The object with the metadata of post
 */
function ingest_article(hatch, item) {
    const {
        author,
        link,
        pubDate,
        summary,
        title,
    } = item;

    return libingester.util.fetch_html(link).then(($) => {
        const util = utilities($, item);
        const asset = new libingester.BlogArticle();
        const post = util.post_metadata();

        // download images
        post.body.find('img').map((id, img) => {
            if (img.attribs.src) {
                let image;
                if ($(img).parent()[0].name != "figure") {
                    const parent = $(img).parent();
                    const figimg = $('<figure></figure>').append($(img).clone());
                    image = libingester.util.download_img(figimg.children());
                    $(img).remove();
                    $(figimg).insertAfter(parent);
                } else {
                    image = libingester.util.download_img($(img));
                }
                image.set_title(title);
                hatch.save_asset(image);
                if (id === 0) {
                    asset.set_thumbnail(image);
                }
            }
        });

        //add p to figcatpions
        post.body.find('figcaption').map((id, figcaption) => {
            const image_description = $('<figcaption><p>' + $(figcaption).html() + '</p></figcaption>');
            $(figcaption).replaceWith(image_description);
        });

        // download video
        post.body.find('iframe').map(function() {
            const src = this.attribs.src;
            if (src.includes("youtube")) {
                const video = libingester.util.get_embedded_video_asset($(this), src);
                video.set_title(title);
                hatch.save_asset(video);
            }
        });
        post.body.find('iframe').remove();

        //Delete empty tags
        post.body.find('span, figcaption, p').filter(function() {
            return $(this).text().trim() === '' && $(this).children().length === 0;
        }).remove();

        // article settings
        asset.set_canonical_uri(link);
        asset.set_last_modified_date(post.date);
        asset.set_title(title);
        asset.set_synopsis(summary);
        asset.set_author(author);
        asset.set_date_published(pubDate);
        asset.set_license('Proprietary');
        asset.set_body(post.body);
        asset.set_tags(post.category.concat(post.tags).split(','));
        asset.set_read_more_text('Read more at www.indiechine.com');
        asset.set_custom_scss(CUSTOM_SCSS);

        asset.render();
        hatch.save_asset(asset);
    }).catch((err) => {
        console.log(err);
        if (err.code == 'ECONNRESET') {
            return ingest_article(hatch, item);
        }
    });
}

function main() {
    // Generally, we only want the last 24 hours worth of content, but this blog doesn´t have a lot activity
    let MAX_DAYS_OLD = 365;
    if (process.env.MAX_DAYS_OLD)
        MAX_DAYS_OLD = parseInt(process.env.MAX_DAYS_OLD);

    // wordpress pagination
    const feed = n => `${RSS_URI}&paged=${n}`;
    const hatch = new libingester.Hatch('indiechine', 'id');
    libingester.util.fetch_rss_entries(feed, 100, MAX_DAYS_OLD).then(rss => {
            console.log(`Ingesting ${rss.length} articles...`);
            return Promise.all(rss.map(entry => ingest_article(hatch, entry)));
        })
        .then(() => hatch.finish())
        .catch(err => {
            console.log(err);
            // Exit without cutting off pending operations
            process.exitCode = 1;
        });

}

main();